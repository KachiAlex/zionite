const fs = require('fs');
const path = 'android/app/src/main/AndroidManifest.xml';
let content = fs.readFileSync(path, 'utf8');
const perms = '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />\n    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />\n';
content = content.replace(
  '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n' + perms
);
fs.writeFileSync(path, content);
console.log('done');
