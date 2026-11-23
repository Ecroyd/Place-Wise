import {viewSchema} from './view';
import {z} from 'zod';
import {destinationSchema} from '@/src/schemas/criteria';
export const savedCriteriaSchema=z.object({version:z.literal(1),mode:z.enum(['live','work','business']),destinations:z.array(destinationSchema).min(1).max(3),// Older saved searches carry a price range; new ones keep it in view.price.
 minimumBudget:z.number().nonnegative().optional(),budget:z.number().positive().optional(),view:viewSchema.optional()}).refine(s=>s.minimumBudget===undefined||s.budget===undefined||s.minimumBudget<=s.budget);
export type SavedCriteria=z.infer<typeof savedCriteriaSchema>;
export interface SavedSearch {id:string;name:string;criteria:SavedCriteria;created_at:string}
export function restoreCriteria(value:unknown):SavedCriteria{
 const criteria=savedCriteriaSchema.parse(value);
 return {...criteria,destinations:criteria.destinations.map(d=>({...d,departureTime:d.departureTime&&new Date(d.departureTime).getTime()>Date.now()?d.departureTime:undefined}))};
}
