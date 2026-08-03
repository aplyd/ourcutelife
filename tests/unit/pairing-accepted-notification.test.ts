import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPairingAcceptedPushMessage,
  PAIRING_ACCEPTED_ROUTE,
} from "../../convex/pairingAcceptedNotification";

void test("pairing acceptance notification is privacy-safe and opens Today", () => {
  const message = buildPairingAcceptedPushMessage("ExponentPushToken[creator-device]");

  assert.deepEqual(message, {
    to: "ExponentPushToken[creator-device]",
    sound: "default",
    title: "You're paired!",
    body: "Your partner joined Our Cute Life.",
    data: { url: PAIRING_ACCEPTED_ROUTE },
  });
  assert.equal(PAIRING_ACCEPTED_ROUTE, "/");
  assert.doesNotMatch(JSON.stringify(message), /code|email|userId|partnerName/i);
});
