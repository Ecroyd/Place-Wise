import {z} from 'zod';
export const viewSchema=z.object({
 layers:z.array(z.enum(['schools','catchments','property','crime','parks','amenities','transport','river','surface'])).max(9).default([]),
 country:z.enum(['all','England','Wales','Scotland']).default('all'),sector:z.enum(['all','state','independent']).default('all'),phase:z.string().max(50).default('All'),rating:z.string().max(60).default('all'),reportArea:z.string().max(80).default('Achievement'),catchmentSchool:z.string().max(40).default(''),
 school:z.object({enabled:z.boolean(),phase:z.string().max(50),rating:z.string().max(60),reportArea:z.string().max(80),maximumWalkMinutes:z.number().min(1).max(60)}).default({enabled:false,phase:'Primary',rating:'all',reportArea:'Achievement',maximumWalkMinutes:15}),
 viewport:z.object({latitude:z.number().min(-85).max(85),longitude:z.number().min(-180).max(180),zoom:z.number().min(0).max(22)}).optional(),
 searchPoint:z.object({latitude:z.number().min(-85).max(85),longitude:z.number().min(-180).max(180)}).optional(),
 destinationIndex:z.number().int().min(-1).max(2).optional(),shading:z.number().min(10).max(60).default(28),visible:z.boolean().default(true)
});
export type SearchView=z.infer<typeof viewSchema>;
export const defaultView=()=>viewSchema.parse({});
