import { redirect } from "next/navigation";

export default function ReviewsRoot() {
  redirect("/app/reviews/pending");
}