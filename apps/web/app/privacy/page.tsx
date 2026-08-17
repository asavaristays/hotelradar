import { InfoDocView } from "../../components/InfoDocView";
import { LegalChrome } from "../../components/LegalChrome";
import { PRIVACY_POLICY } from "../../lib/content";

export default function PrivacyPage() {
  return (
    <LegalChrome title="Privacy policy">
      <InfoDocView doc={PRIVACY_POLICY} />
    </LegalChrome>
  );
}
