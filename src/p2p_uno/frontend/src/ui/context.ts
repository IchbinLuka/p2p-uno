import { createContext } from "react";
import type { API } from "../model/api";

export const APIContext = createContext<API | null>(null);
