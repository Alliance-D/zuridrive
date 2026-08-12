/**
 * Which name to show for an owner.
 *
 * A company owner has a business name, and that is what a renter should see on
 * a listing — they are renting from "Kigali Fleet Ltd", not from whoever at
 * that company happens to hold the login. An individual shows their own name.
 *
 * One function so the rule cannot drift between the listing, the booking, the
 * confirmation email and the admin tables. Any of those quietly falling back to
 * the personal name would leak the operator's identity to renters, which is
 * exactly what a business name exists to avoid.
 */

export interface OwnerIdentitySource {
  ownerType?: "INDIVIDUAL" | "COMPANY" | null;
  businessName?: string | null;
  user?: { name?: string | null } | null;
}

/** The public-facing name: business name for companies, person for individuals. */
export function ownerDisplayName(
  owner: OwnerIdentitySource | null | undefined,
  fallback = "ZuriDrive owner",
): string {
  if (!owner) return fallback;

  if (owner.ownerType === "COMPANY") {
    // Fall through to the personal name if a company hasn't filled the field
    // in yet — an empty listing byline is worse than the wrong kind of name.
    return owner.businessName?.trim() || owner.user?.name?.trim() || fallback;
  }

  return owner.user?.name?.trim() || fallback;
}

/** True when this owner should be asked for business details. */
export function isCompany(owner: OwnerIdentitySource | null | undefined): boolean {
  return owner?.ownerType === "COMPANY";
}
