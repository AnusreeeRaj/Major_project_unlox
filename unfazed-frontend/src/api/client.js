import axios from "axios";
import { demoRequest } from "./demo";
export const DEMO = import.meta.env.VITE_DEMO_MODE !== "false";
export const BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";
let token = "";
export const setToken = (v) => {
  token = v;
};
export const getToken = () => token;
const http = axios.create({ baseURL: BASE });
export async function api(method, path, body) {
  if (DEMO) return demoRequest(method, path, body);
  try {
    return (
      await http({
        method,
        url: path,
        data: body,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    ).data;
  } catch (e) {
    throw Object.assign(
      Error(
        e.response?.data?.message ??
          "Cannot reach the API. Check that the backend is running.",
      ),
      { code: e.response?.data?.code },
    );
  }
}
export async function downloadInvoice(payment) {
  if (DEMO) {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    pdf.setFontSize(24);
    pdf.text("unfazed.", 20, 25);
    pdf.setFontSize(16);
    pdf.text("DEMO PAYMENT RECEIPT", 20, 45);
    pdf.setFontSize(11);
    pdf.text(
      [
        `Receipt: ${payment.receipt}`,
        `Date: ${new Date(payment.createdAt).toLocaleDateString("en-IN")}`,
        `Amount: INR ${(payment.amountPaise / 100).toFixed(2)}`,
        "Status: Simulated payment",
        "",
        "Fictional demonstration. No money was collected.",
        "Not a statutory tax invoice.",
      ],
      20,
      62,
    );
    pdf.save(`invoice-${payment.receipt}.pdf`);
    return;
  }
  const response = await http.get(`/payments/${payment._id}/invoice`, {
    responseType: "blob",
    headers: { Authorization: `Bearer ${token}` },
  });
  const url = URL.createObjectURL(response.data),
    a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${payment.receipt}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
