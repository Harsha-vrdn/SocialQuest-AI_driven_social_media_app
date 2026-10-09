const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'notification-worker.js'), 'utf8');
function worker(contexts) {
  const listeners = {}, shown = [], opened = [];
  const clients = contexts.map(context => ({postMessage(message, ports) {ports[0].reply(context);}, async focus() {}}));
  class Channel {
    constructor() {this.port1 = {close() {}};this.port2 = {reply: data => this.port1.onmessage({data})};}
  }
  vm.runInNewContext(source, {MessageChannel:Channel,setTimeout,clearTimeout,self:{
    addEventListener:(type, handler) => {listeners[type] = handler;},
    clients:{matchAll:async()=>clients,openWindow:async path=>opened.push(path)},
    registration:{showNotification:async(title,data)=>shown.push({title,...data})},
  }});
  return {shown,opened,async push(data) {let pending;listeners.push({data:{json:()=>data},waitUntil:promise=>{pending=promise;}});await pending;}, async click(data) {let pending;listeners.notificationclick({notification:{data,close(){}},waitUntil:promise=>{pending=promise;}});await pending;}};
}
const message = {title:'Alex',body:'Hello',kind:'MESSAGE',recipient_id:3,delivery_id:10,conversation_id:7};
test('visible Chats suppresses a received message, including a late push', async () => {
  const w = worker([{userId:3,chatsOpen:true}]);await w.push(message);assert.equal(w.shown.length,0);
});
test('other notifications still display while Chats is open', async () => {
  const w = worker([{userId:3,chatsOpen:true}]);await w.push({...message,kind:'RSVP',event_id:2});assert.equal(w.shown.length,1);
});
test('background delivery displays with no open windows', async () => {
  const w = worker([]);await w.push(message);assert.equal(w.shown.length,1);assert.equal(w.shown[0].data.path,'/?view=chats&conversation=7');
});
test('a signed-out or different account does not display another user’s push', async () => {
  for (const userId of [null,4]) {const w=worker([{userId,chatsOpen:false}]);await w.push(message);assert.equal(w.shown.length,0);}
});
test('notification clicks construct an internal route rather than trusting a payload URL', async () => {
  const w=worker([]);await w.click({...message,path:'https://attacker.example',url:'https://attacker.example'});assert.deepEqual(w.opened,['/?view=chats&conversation=7']);
});
test('malformed notifications are ignored', async () => {
  const w=worker([]);await w.push({title:{},body:'x'});assert.equal(w.shown.length,0);
});
