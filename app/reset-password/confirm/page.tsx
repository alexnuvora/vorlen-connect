import PasswordForm from './password-form';
import '../../login/login.css';
export default function Confirm(){return <main className="vl-login"><section className="vl-story"><div className="vl-wordmark"><span className="vl-logomark">V<span>.</span></span>vorlen <strong>connect</strong></div><div className="vl-story-content"><div className="vl-eyebrow">ACCOUNT SECURITY</div><h1>Secure your<br/><em>next connection.</em></h1></div><div className="vl-story-footer">© {new Date().getFullYear()} Vorlen</div></section><section className="vl-form-panel"><PasswordForm/></section></main>;}
