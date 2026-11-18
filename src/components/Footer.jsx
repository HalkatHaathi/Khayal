import { A } from '../content';
import { useCatalog } from '../store';
import { Facebook, Instagram, XIcon } from './Icons';

const Stamp = () => <img className="stamp" src="/logo.webp" alt="Khyal" width="88" height="88" loading="lazy" />;

export default function Footer() {
  const { content } = useCatalog();
  const { footer } = content.menus;
  const { social, copyright } = content.site;
  return (
    <footer className="ftr">
      <div className="ftr__cols">
        <div className="ftr__brand">
          <Stamp />
          <p>Craft, culture and contemporary expression, stitched together with purpose.</p>
        </div>
        {footer.map((c) => (
          <div key={c.title}>
            <h2>{c.title}</h2>
            <ul>{c.links.map((l) => <li key={l.label + l.to}><A to={l.to}>{l.label}</A></li>)}</ul>
          </div>
        ))}
        <div>
          <h2>Social</h2>
          <div className="ftr__social">
            {social.instagram && <A to={social.instagram} aria-label="Instagram"><Instagram size={20} /></A>}
            {social.facebook && <A to={social.facebook} aria-label="Facebook"><Facebook size={20} /></A>}
            {social.x && <A to={social.x} aria-label="X"><XIcon size={18} /></A>}
          </div>
        </div>
      </div>
      <div className="ftr__base">
        <p>{copyright}</p>
        <ul className="pay" aria-label="Accepted payments">
          {['VISA', 'Mastercard', 'RuPay', 'UPI', 'AMEX'].map((m) => <li key={m}>{m}</li>)}
        </ul>
      </div>
    </footer>
  );
}
