import type { InstantRules } from "@instantdb/admin";

const rules = {
  tasks: {
    allow: {
      view: "true",
      create: "true",
      delete: "true",
      update: "true",
    },
  },
  messages: {
    allow: {
      view: "true",
      create: "true",
      delete: "true",
      update: "true",
    },
  },
  $files: {
    allow: {
      view: "true",
      create: "true",
      delete: "true",
    },
  },
  dictionaryTerms: {
    allow: {
      view: "true",
      create: "true",
      delete: "true",
      update: "true",
    },
  },
} satisfies InstantRules;

export default rules;
