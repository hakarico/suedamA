import {t,useLocale} from './i18n';
import {FishLogo} from './FishLogo';
import {Icon} from './Icon';
import type {CanvasStore} from './store';
export function NavigationRail({store}:{store:CanvasStore}){useLocale();return <nav className="navigation-rail" aria-label={t("侧栏快捷操作")}>
  <button className="rail-logo" aria-label={t("展开侧边栏")} onClick={()=>store.navigation('expand')}><FishLogo/></button>
  <button aria-label={t("搜索对话")} onClick={()=>store.navigation('search')}><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1"><path d="M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z M10.2991 10.3933L14.7783 14.8725"/></svg></button>
  <button className="rail-bottom" aria-label={t("用户选项")} onClick={()=>void store.navigation('account')}><Icon name="more"/></button>
</nav>;}
