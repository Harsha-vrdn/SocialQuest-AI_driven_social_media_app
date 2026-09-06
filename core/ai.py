"""AI quest generation with safe, distinct local fallbacks."""
import json
import os


def _read_json(response):
    raw = response.content.strip().removeprefix("```json").removesuffix("```").strip()
    return json.loads(raw)


def _fallback_main_quest(event):
    return [{
        "kind": "MAIN",
        "title": f"Find your crew at {event.name.strip()}",
        "instructions": "Introduce yourself to two new people and capture one shared photo that celebrates the moment.",
        "xp_reward": 120,
        "position": 1,
    }]


def _fallback_side_quests(participant_number):
    lenses = [
        "Story swap", "Curiosity spark", "Local lens", "Skill share", "Playlist trail",
        "Hidden talent", "Memory map", "Small kindness", "Fresh perspective", "Joy hunt",
        "Conversation compass", "Creative detour",
    ]
    activities = [
        "Ask someone what brought them here and compare a small detail from your stories.",
        "Find a new idea you both want to try this month and make a tiny plan together.",
        "Trade one local recommendation that the other person could genuinely use.",
        "Learn a simple skill, shortcut, or fact from another guest and try it together.",
        "Share a song, book, film, or place that shaped you and listen to the other person's pick.",
        "Invite someone to show an unexpected strength or interest they enjoy.",
        "Swap a favourite memory connected to this kind of place or activity.",
        "Do one thoughtful, practical thing that makes another guest's experience easier.",
        "Ask for a viewpoint different from yours and reflect back what you learned.",
        "Find one small thing at the event that makes both of you smile.",
        "Turn an ordinary object or moment here into an imaginative conversation starter.",
        "Make a quick collaborative idea, sketch, or list with someone you just met.",
    ]
    first = (participant_number - 1) % len(lenses)
    second = (participant_number * 5 + 3) % len(lenses)
    return [
        {
            "kind": "SIDE",
            "title": f"{lenses[first]} · {participant_number:02d}",
            "instructions": activities[first] + " Upload a photo or short reel of the shared moment.",
            "xp_reward": 45,
            "position": 1,
        },
        {
            "kind": "SIDE",
            "title": f"{lenses[second]} · {participant_number:02d}",
            "instructions": activities[second] + " Upload a photo or short reel of the shared moment.",
            "xp_reward": 60,
            "position": 2,
        },
    ]


def generate_quests(event):
    """Return the single main quest shared by every participant."""
    if not os.getenv("OPENAI_API_KEY"):
        return _fallback_main_quest(event)
    try:
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_openai import ChatOpenAI

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You create kind, low-pressure, inclusive real-world social quests. Never include alcohol, risky, illegal, humiliating, romantic, or exclusionary tasks. Responses must be JSON only."),
            ("human", "Create exactly one shared MAIN quest (100-150 XP) for every participant in this event. It must require a photo or short reel as proof. Event name: {name}. Description: {description}. Location: {location}. Return a JSON array with one object containing kind, title, instructions, xp_reward, position."),
        ])
        response = (prompt | ChatOpenAI(model="gpt-4o-mini", temperature=0.7)).invoke({
            "name": event.name,
            "description": event.description,
            "location": event.location_name,
        })
        quests = _read_json(response)
        if len(quests) != 1 or quests[0].get("kind") != "MAIN":
            raise ValueError("Invalid main quest shape")
        return quests
    except Exception:
        return _fallback_main_quest(event)


def generate_side_quests(event, participant, participant_number, existing_titles=()):
    """Return two side quests that belong only to one accepted participant."""
    fallback = _fallback_side_quests(participant_number)
    if not os.getenv("OPENAI_API_KEY"):
        return fallback
    try:
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_openai import ChatOpenAI

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You create kind, low-pressure, inclusive real-world social quests. Never include alcohol, risky, illegal, humiliating, romantic, or exclusionary tasks. Responses must be JSON only."),
            ("human", "Create exactly two distinct SIDE quests (30-80 XP) for one participant. They must require a photo or short reel as proof and must not reuse these prior side-quest titles: {existing_titles}. Give each a clearly different social activity. Event name: {name}. Description: {description}. Location: {location}. Participant number: {participant_number}. Return a JSON array with two objects containing kind, title, instructions, xp_reward, position."),
        ])
        response = (prompt | ChatOpenAI(model="gpt-4o-mini", temperature=0.85)).invoke({
            "name": event.name,
            "description": event.description,
            "location": event.location_name,
            "participant_number": participant_number,
            "existing_titles": "; ".join(existing_titles) or "None",
        })
        quests = _read_json(response)
        normalized_titles = {title.strip().lower() for title in existing_titles}
        if len(quests) != 2 or any(quest.get("kind") != "SIDE" for quest in quests):
            raise ValueError("Invalid side quest shape")
        if len({quest.get("title", "").strip().lower() for quest in quests}) != 2:
            raise ValueError("Duplicate side quests")
        if any(quest.get("title", "").strip().lower() in normalized_titles for quest in quests):
            raise ValueError("Reused side quest")
        for position, quest in enumerate(quests, start=1):
            quest["position"] = position
        return quests
    except Exception:
        return fallback
