import {installHistoryBridge} from './history-bridge';
import {installNativeNavigationBridge} from './native-navigation';
installHistoryBridge(window);
installNativeNavigationBridge(window);
