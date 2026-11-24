import MockPay from "./MockPay";

export const metadata = { title: "测试付款", robots: { index: false } };

export default function Page() {
  return <MockPay />;
}
