import { redirect } from "next/navigation";

export const metadata = {
  title: "Datenschutzerklärung — Medcase",
};

export default function DatenschutzPage() {
  redirect("/impressum#datenschutz");
}
