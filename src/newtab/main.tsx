import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/shippori-mincho/400.css';
import '@fontsource/shippori-mincho/500.css';
import '@fontsource/shippori-mincho/600.css';
import { render } from 'preact';
import { htmlLang, t } from '../i18n';
import { App } from './App';
import './newtab.css';

document.documentElement.lang = htmlLang();
document.title = t('newtab.title');
render(<App />, document.getElementById('app')!);
