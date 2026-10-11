import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Vorlen Connect — Your outreach workspace',description:'Connected research, messaging and enrichment for Vorlen.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
