import {z} from 'zod';
import {fail,linkedinId} from './security.mjs';
const ident=z.string().min(1).max(300).regex(/^[\p{L}\p{N}_:().,-]+$/u);
const plain=z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f]+$/);
const entity=z.string().regex(/^\d{1,25}$/,'Use the numeric LinkedIn entity ID, not a name or slug.');
const page=z.object({start:z.number().int().min(0).max(1000).default(0),count:z.number().int().min(1).max(25).default(10)}).strict();
const email=z.string().email().max(254).regex(/^[^\r\n]+$/);
const host=z.string().toLowerCase().min(4).max(253).regex(/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
export const SESSION_WRITES=['send_message','send_invitation','send_email'];
export const SESSION_READS=['profile','contact','company','search_companies','inbox','conversation','invitations','sent_invitations','connections','network_status','search_people','feed','post_comments','recruiter','emails','search_jobs','employees'];
export const SESSION_SCHEMAS={
 connect:z.object({email,password:z.string().min(1).max(1000)}).strict(),
 connect_mail:z.object({email,password:z.string().min(1).max(1000),imap_host:host,imap_port:z.literal(993).default(993),smtp_host:host,smtp_port:z.union([z.literal(465),z.literal(587)]).default(465)}).strict(),
 import:z.object({li_at:z.string().min(10).max(4000).regex(/^[^\s;\r\n]+$/),jsessionid:z.string().min(3).max(300).regex(/^[^;\r\n]+$/)}).strict(),
 verify:z.object({code:z.string().regex(/^[a-zA-Z0-9 -]{4,16}$/)}).strict(),refresh:z.object({}).strict(),
 profile:z.object({identifier:ident.optional()}).strict(),contact:z.object({identifier:ident}).strict(),company:z.object({identifier:ident}).strict(),
 inbox:page.extend({category:z.enum(['INBOX','UNREAD']).default('INBOX')}),invitations:page,sent_invitations:page,connections:page,
 network_status:z.object({identifier:ident}).strict(),
 conversation:page.extend({conversation_id:ident.optional(),identifier:ident.optional()}).refine(p=>Boolean(p.conversation_id)!==Boolean(p.identifier),'Supply exactly one conversation_id or profile identifier.'),
 search_people:page.extend({keywords:plain.optional(),location:entity.optional(),current_company:entity.optional(),first_name:plain.optional(),last_name:plain.optional(),title:plain.optional(),industry:entity.optional(),school:entity.optional(),network:z.enum(['F','S','O']).optional()}),
 search_companies:page.extend({keywords:plain.optional(),location:entity.optional(),sector:entity.optional(),company_size:z.enum(['B','C','D','E','F','G','H','I']).optional()}),
 feed:page,post_comments:page.extend({post_id:z.string().regex(/^\d{1,30}$/)}),recruiter:z.object({}).strict(),
 employees:page.extend({identifier:ident}),
 search_jobs:page.extend({keywords:plain,location:plain.optional(),country:plain.optional(),is_remote:z.boolean().optional(),job_type:z.enum(['fulltime','parttime','contract','internship']).optional()}),
 emails:page.extend({unread_only:z.boolean().default(false)}),
 send_message:z.object({conversation_id:ident.optional(),identifier:ident.optional(),content:z.string().trim().min(1).max(3000)}).strict().refine(p=>Boolean(p.conversation_id)!==Boolean(p.identifier),'Supply exactly one conversation_id or profile identifier.'),
 send_invitation:z.object({identifier:z.string().min(1).max(1000),content:z.string().trim().max(200).default('')}).strict(),
 send_email:z.object({to:email,subject:z.string().min(1).max(300).regex(/^[^\r\n]+$/),text:z.string().max(50000).optional(),html:z.string().max(50000).optional(),reply_to:email.optional()}).strict().refine(p=>p.text?.trim()||p.html?.trim(),'Email body required.'),
};
export function validateSessionInput(operation,input){
 if(!SESSION_SCHEMAS[operation])fail('UNKNOWN_OPERATION','Unknown session operation.',400);
 const parsed=SESSION_SCHEMAS[operation].parse(input);
 if(operation==='send_invitation')parsed.identifier=linkedinId(parsed.identifier);
 return parsed;
}
