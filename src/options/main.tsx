import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/shippori-mincho/400.css';
import { render } from 'preact';
import { Options } from './Options';
import './options.css';

render(<Options />, document.getElementById('app')!);
