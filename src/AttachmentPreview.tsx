import {t,useLocale} from './i18n';
const FILE_BODY = 'M8.48924 28H19.5108C21.6479 28 22.7165 28 23.5594 27.6509C24.6833 27.1853 25.5762 26.2924 26.0417 25.1685C26.3909 24.3256 26.3909 23.257 26.3909 21.1199V8.79443C26.3909 8.32877 26.3909 8.09593 26.3471 7.87507C26.2887 7.58058 26.173 7.30042 26.0067 7.05048C25.882 6.86303 25.7177 6.69799 25.3893 6.36792L20.0611 1.01354C19.7304 0.681235 19.5651 0.515081 19.3769 0.38885C19.126 0.220541 18.8443 0.103463 18.5481 0.0443412C18.3259 0 18.0915 0 17.6226 0H8.48924C6.35209 0 5.28351 0 4.4406 0.349145C3.31672 0.814671 2.4238 1.70759 1.95828 2.83147C1.60913 3.67438 1.60913 4.74296 1.60913 6.88011V21.1199C1.60913 23.257 1.60913 24.3256 1.95828 25.1685C2.4238 26.2924 3.31672 27.1853 4.4406 27.6509C5.28351 28 6.35209 28 8.48924 28Z'
const FILE_FOLD = 'M26.3909 7.37445L19.0525 0V3.77445C19.0525 4.89271 19.0525 5.45184 19.2352 5.89289C19.4788 6.48096 19.946 6.94818 20.5341 7.19176C20.9751 7.37445 21.5342 7.37445 22.6525 7.37445H26.3909Z'
/** dsh ComposerAttachments/FileCard presentation; the webpage adapter owns upload state. */
export function AttachmentPreview({name,image,bytes,onRemove}:{name:string;image?:string;bytes?:number;onRemove?:()=>void}){useLocale();
  const extension=name.split('.').length>1?name.split('.').at(-1)!.toUpperCase().slice(0,8):'FILE';
  const size=bytes===undefined?'':bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':(bytes/1024/1024).toFixed(1)+' MB';
  return <div className={image?'attachment-image-item':'attachment-file-card'} title={name}>
    {image?<button className="attachment-thumbnail" type="button" data-image={image} aria-label={t("预览")+name}><img src={image} alt={name}/></button>:<><span className="attachment-file-icon" aria-hidden="true"><svg viewBox="0 0 28 28" width="28" height="28" fill="none"><path d={FILE_BODY} fill="currentColor"/><path d={FILE_FOLD} fill="#fff" fillOpacity=".7"/></svg></span><span className="attachment-file-body"><span className="attachment-file-name">{name}</span><span className="attachment-file-meta">{[extension,size].filter(Boolean).join(' · ')}</span></span></>}
    {onRemove&&<button className="attachment-remove" type="button" aria-label={t("移除")+name} onClick={onRemove}>×</button>}
  </div>;
}
