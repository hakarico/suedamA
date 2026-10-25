import artboard from './assets/layout-dashboard.svg';
import folders from './assets/folders.svg';
import folderSimple from './assets/folder-simple.svg';
import sort from './assets/arrows-down-up.svg';
import {WorldlineGlyph} from './WorldlineGlyph';
type Glyph=Parameters<typeof WorldlineGlyph>[0]['kind'];
const aliases={bookmarkFill:'bookmark-fill',bookmarksFill:'bookmarks-fill',text:'immersive',lines:'text-summary',search:'find',canvas:'chat-text',arrow:'fork'} as const;
export type IconName=Glyph | keyof typeof aliases | 'download' | 'upload' | 'artboard' | 'folders' | 'folder-simple' | 'sort';
/** Existing actions use the exact glyph source shipped by the plugin. */
export function Icon({name}: {name:IconName}) {
  if(name==='artboard'||name==='folders'||name==='folder-simple'||name==='sort')return <span className={'icon icon-'+name} dangerouslySetInnerHTML={{__html:({'artboard':artboard,folders,'folder-simple':folderSimple,sort})[name]}}/>;
  if(name==='download' || name==='upload')return <span className="icon"><svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={name==='download'?'M128 32v136m-48-48 48 48 48-48M40 176v40h176v-40':'M128 168V32m-48 48 48-48 48 48M40 176v40h176v-40'}/></svg></span>;
  return <span className="icon"><WorldlineGlyph kind={name in aliases ? aliases[name as keyof typeof aliases] : name as Glyph}/></span>;
}
