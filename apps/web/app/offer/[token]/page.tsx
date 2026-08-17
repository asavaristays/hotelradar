import { OfferView } from "../../../components/OfferView";
import { SiteChrome } from "../../../components/SiteChrome";

export default async function OfferPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <SiteChrome title="Private offer">
      <OfferView token={token} />
    </SiteChrome>
  );
}
