export type TryOnCategory = "upper_body" | "lower_body" | "dresses";

export interface TryOnGarment {
  /** URL (signed) or data URI the provider can fetch. */
  imageUrl: string;
  category: TryOnCategory;
  description: string;
}

export type TryOnJobStatus =
  | { status: "processing" }
  | { status: "succeeded"; outputUrl: string }
  | { status: "failed"; message: string };

/**
 * 3. Virtual try-on provider. One call = one garment applied to a person
 * photo; multi-garment outfits are chained by the orchestrator.
 */
export interface TryOnProvider {
  readonly name: string;
  /** Categories this provider can actually render. */
  readonly supportedCategories: readonly TryOnCategory[];
  submit(input: { personImageUrl: string; garment: TryOnGarment }): Promise<{ jobId: string }>;
  poll(jobId: string): Promise<TryOnJobStatus>;
}
