import { HotelAttestView } from "../../../../components/HotelAttestView";

export default async function HotelAttestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <HotelAttestView token={token} />;
}
