export const ACCOUNT_TYPES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  CUSTOMER: 'customer',
  CARRIER: 'carrier',
});

export const ACCOUNT_TYPE_VALUES = Object.freeze(Object.values(ACCOUNT_TYPES));

export const SELF_REGISTRATION_TYPES = Object.freeze([ACCOUNT_TYPES.CUSTOMER, ACCOUNT_TYPES.CARRIER]);
