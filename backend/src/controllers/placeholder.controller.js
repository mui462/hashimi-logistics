import { sendSuccess } from '../utils/apiResponse.js';

export const getPlaceholder = (moduleName) => (_req, res) => {
  sendSuccess(res, {
    message: `The ${moduleName} module is scaffolded and not implemented yet.`,
    data: { module: moduleName, status: 'placeholder' },
  });
};
