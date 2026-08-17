import { InfoDocView } from "../../components/InfoDocView";
import { LegalChrome } from "../../components/LegalChrome";
import { BOOKING_HOW_IT_WORKS } from "../../lib/content";

export default function HowBookingWorksPage() {
  return (
    <LegalChrome title="How booking works">
      <InfoDocView doc={BOOKING_HOW_IT_WORKS} />
    </LegalChrome>
  );
}
