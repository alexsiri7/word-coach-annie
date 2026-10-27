import { z } from "zod";
import { isHttpUrl } from "@/lib/http-url";

export const HttpUrl = z.string().refine(isHttpUrl, { message: "must be an absolute http(s) URL" });
