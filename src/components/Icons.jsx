const I = ({ d, size = 20, fill, children, ...r }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || 'none'} stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...r}>
    {d ? <path d={d} /> : children}
  </svg>
);

export const Menu = (p) => <I {...p} d="M4 7h16M4 12h16M4 17h16" />;
export const Search = (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>;
export const User = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.2 18.2c1.4-2.2 3.4-3.2 5.8-3.2s4.4 1 5.8 3.2" /></I>;
export const Bag = (p) => <I {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.5A3 3 0 0 1 12 4a3 3 0 0 1 3 2.5V8" /></I>;
export const ArrowRight = (p) => <I {...p} d="M4 12h16m-6-6 6 6-6 6" />;
export const ArrowLeft = (p) => <I {...p} d="M20 12H4m6-6-6 6 6 6" />;
export const ArrowUp = (p) => <I {...p} d="M12 20V4m-6 6 6-6 6 6" />;
export const Close = (p) => <I {...p} d="M6 6l12 12M18 6 6 18" />;
export const Plus = (p) => <I {...p} d="M12 5v14M5 12h14" />;
export const Instagram = (p) => <I {...p}><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.7" cy="7.3" r=".6" fill="currentColor" /></I>;
export const Facebook = (p) => <I {...p} d="M14 8h2V4.5h-2.6C10.8 4.5 9.5 6 9.5 8.4V10.5H7V14h2.5v6H13v-6h2.4l.6-3.5H13V8.6c0-.4.2-.6 1-.6Z" />;
export const XIcon = (p) => <I {...p} d="M5 4l14 16M19 4 5 20" />;
export const WhatsApp = (p) => (
  <svg width={p.size || 30} height={p.size || 30} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.500-.7-1.700-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.200-.3.200-.5.100-.7-.3-1.500-.8-2.200-1.600-.5-.5-.9-1.100-1.100-1.500-.1-.2 0-.4.100-.5l.4-.5.2-.4c.1-.1 0-.3 0-.4l-.8-1.800c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.300-.7.700-1 1.500-.9 2.400.2 1 .7 1.900 1.300 2.700 1.200 1.600 2.700 2.800 4.500 3.500 1.400.5 2.200.4 3 .3.7-.2 1.500-.7 1.700-1.400.1-.4.1-.7.100-.8l-.5-.3Z" />
  </svg>
);
export const Filter = (p) => <I {...p} d="M4 5h16l-6 7.500V19l-4-2v-4.500L4 5Z" />;
export const ChevronDown = (p) => <I {...p} d="m6 9 6 6 6-6" />;
export const Minus = (p) => <I {...p} d="M5 12h14" />;
export const Lock = (p) => <I {...p}><rect x="5" y="11" width="14" height="9" rx="1.500" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></I>;
