const {AndroidConfig, withAndroidColors, withAndroidColorsNight, withAndroidStyles, withGradleProperties} = require('expo/config-plugins');

// Keep native defaults aligned with the React palette, including before JS/fonts
// load. Persist edge-to-edge on older Android versions across Expo prebuilds.
module.exports = function withAndroidSystemBars(config, {lightBackground, darkBackground}) {
  for (const color of [lightBackground, darkBackground]) {
    if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('System bar backgrounds must be opaque RGB colors.');
  }
  for (const [withColors, value] of [[withAndroidColors, lightBackground], [withAndroidColorsNight, darkBackground]]) {
    config = withColors(config, mod => {
      mod.modResults = AndroidConfig.Colors.assignColorValue(mod.modResults, {name: 'app_background', value});
      return mod;
    });
  }
  config = withAndroidStyles(config, mod => {
    const items = {
      'android:windowBackground': '@color/app_background',
      'android:colorBackground': '@color/app_background',
      'android:statusBarColor': '@android:color/transparent',
      'android:windowLightStatusBar': '?attr/isLightTheme',
      'android:enforceStatusBarContrast': 'false',
      'android:navigationBarColor': '@android:color/transparent',
      'android:navigationBarDividerColor': '@android:color/transparent',
      'android:windowLightNavigationBar': '?attr/isLightTheme',
      'android:enforceNavigationBarContrast': 'false',
      expoEnforceNavigationBarContrast: 'false',
    };
    for (const [name, value] of Object.entries(items)) {
      mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
        parent: AndroidConfig.Styles.getAppThemeGroup(), name, value, add: true,
      });
    }
    return mod;
  });
  return withGradleProperties(config, mod => {
    mod.modResults = mod.modResults.filter(item => item.type !== 'property' || item.key !== 'edgeToEdgeEnabled');
    mod.modResults.push({type: 'property', key: 'edgeToEdgeEnabled', value: 'true'});
    return mod;
  });
};
