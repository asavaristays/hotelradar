import { RequestStatus } from "../../../components/RequestStatus";
import { SiteChrome } from "../../../components/SiteChrome";

export default async function RequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <SiteChrome title="Your request">
      <RequestStatus token={token} />
    </SiteChrome>
  );
}
