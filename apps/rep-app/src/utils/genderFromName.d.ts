/**
 * Infer gender from name prefix/title for subtle icon display.
 * Mr, Dr → male; Ms, Mrs, Dra → female.
 */
export type Gender = "male" | "female";
export declare function getGenderFromName(name: string | null | undefined): Gender | null;
