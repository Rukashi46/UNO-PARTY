import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Suppress yellow LogBox popups in the application
LogBox.ignoreAllLogs(true);

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
