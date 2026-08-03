type MembershipUser = {
  _id: string;
  authUserId?: string;
};

type MembershipViewer = {
  couple: { _id: string } | null;
  memberCount: number;
  user: MembershipUser;
  partner: MembershipUser | null;
};

type MembershipAccessInput = {
  sessionPending: boolean;
  hasSession: boolean;
  viewer: MembershipViewer | null | undefined;
};

export type MembershipAccess = "loading" | "signed-out" | "pairing" | "paired";

function isRealDistinctPartner(viewer: MembershipViewer): boolean {
  const partner = viewer.partner;
  if (!partner || partner._id === viewer.user._id) return false;
  return Boolean(
    viewer.user.authUserId &&
    partner.authUserId &&
    partner.authUserId !== viewer.user.authUserId &&
    !partner.authUserId.startsWith("test-partner:"),
  );
}

export function resolveMembershipAccess(input: MembershipAccessInput): MembershipAccess {
  if (input.sessionPending) return "loading";
  if (!input.hasSession) return "signed-out";
  if (input.viewer === undefined) return "loading";
  if (
    !input.viewer?.couple ||
    input.viewer.memberCount !== 2 ||
    !isRealDistinctPartner(input.viewer)
  ) {
    return "pairing";
  }
  return "paired";
}
