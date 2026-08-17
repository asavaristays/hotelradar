import { InfoDocView } from "../../components/InfoDocView";
import { LegalChrome } from "../../components/LegalChrome";
import { TERMS_OF_SERVICE } from "../../lib/content";

export default function TermsPage() {
  return (
    <LegalChrome title="Terms of service">
      <InfoDocView doc={TERMS_OF_SERVICE} />
    </LegalChrome>
  );
}
