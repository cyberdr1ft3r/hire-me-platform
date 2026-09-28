import type {
  ClientContactCreateRequest,
  ClientContactUpdateRequest,
  ClientCreateRequest,
  ClientUpdateRequest,
} from '@hire-me/contracts';

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type ClientCreateValues = {
  city: string;
  commercialSummary: string;
  country: string;
  industry: string;
  mainPhone: string;
  name: string;
  website: string;
};

export type ClientProfileValues = ClientCreateValues;

export type ContactCreateValues = {
  displayName: string;
  email: string;
  phone: string;
  roleTitle: string;
};

export type ContactProfileValues = ContactCreateValues;

export function toClientCreateRequest(
  values: ClientCreateValues,
  includeCommercial: boolean,
): ClientCreateRequest {
  return {
    name: values.name.trim(),
    industry: optional(values.industry),
    website: optional(values.website),
    mainPhone: optional(values.mainPhone),
    country: optional(values.country),
    city: optional(values.city),
    ...(includeCommercial ? { commercialSummary: optional(values.commercialSummary) } : {}),
  };
}

export function toClientUpdateRequest(
  values: ClientProfileValues,
  includeCommercial: boolean,
): ClientUpdateRequest {
  return {
    name: values.name.trim(),
    industry: nullable(values.industry),
    website: nullable(values.website),
    mainPhone: nullable(values.mainPhone),
    country: nullable(values.country),
    city: nullable(values.city),
    ...(includeCommercial ? { commercialSummary: nullable(values.commercialSummary) } : {}),
  };
}

export function toContactCreateRequest(values: ContactCreateValues): ClientContactCreateRequest {
  return {
    displayName: values.displayName.trim(),
    email: values.email.trim(),
    phone: optional(values.phone),
    roleTitle: optional(values.roleTitle),
  };
}

export function toContactUpdateRequest(values: ContactProfileValues): ClientContactUpdateRequest {
  return {
    displayName: values.displayName.trim(),
    email: values.email.trim(),
    phone: nullable(values.phone),
    roleTitle: nullable(values.roleTitle),
  };
}

export function clientSummaryToProfileValues(client: {
  city: string | null;
  commercial?: { commercialSummary: string | null } | null;
  country: string | null;
  industry: string | null;
  mainPhone: string | null;
  name: string;
  website: string | null;
}): ClientProfileValues {
  return {
    name: client.name,
    industry: client.industry ?? '',
    website: client.website ?? '',
    mainPhone: client.mainPhone ?? '',
    country: client.country ?? '',
    city: client.city ?? '',
    commercialSummary: client.commercial?.commercialSummary ?? '',
  };
}

export function contactSummaryToProfileValues(contact: {
  displayName: string;
  email: string;
  phone: string | null;
  roleTitle: string | null;
}): ContactProfileValues {
  return {
    displayName: contact.displayName,
    email: contact.email,
    phone: contact.phone ?? '',
    roleTitle: contact.roleTitle ?? '',
  };
}
