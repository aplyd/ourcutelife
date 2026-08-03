export const PAIRING_ACCEPTED_ROUTE = "/";

export type PairingAcceptedPushMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: { url: typeof PAIRING_ACCEPTED_ROUTE };
};

export function buildPairingAcceptedPushMessage(pushToken: string): PairingAcceptedPushMessage {
  return {
    to: pushToken,
    sound: "default",
    title: "You're paired!",
    body: "Your partner joined Our Cute Life.",
    data: { url: PAIRING_ACCEPTED_ROUTE },
  };
}
