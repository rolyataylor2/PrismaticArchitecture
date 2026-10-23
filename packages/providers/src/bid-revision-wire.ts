import { z } from 'zod';

/** Encode the existing domain correlation that JSON Schema cannot export from a refinement. */
export function bidRevisionWireSchema<T>(schema: z.ZodType<T>): z.ZodType {
  if (!(schema instanceof z.ZodObject)) return schema;
  const { bid_disposition: disposition, new_bid: bid } = schema.shape;
  if (!(disposition instanceof z.ZodEnum) || !(bid instanceof z.ZodNullable)
    || !disposition.options.includes('replace')
    || disposition.options.some(value => !['retain', 'replace', 'withdraw'].includes(value as string))) return schema;
  return z.union(disposition.options.map(value => schema.safeExtend({
    bid_disposition: z.literal(value), new_bid: value === 'replace' ? bid.unwrap() : z.null(),
  })));
}
