import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/shippori-mincho/400.css';
import { render } from 'preact';
import { t } from '../i18n';
import { Options } from './Options';
import './options.css';

document.title = t('options.title');
render(<Options />, document.getElementById('app')!);
