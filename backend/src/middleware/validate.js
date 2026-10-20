import { ApiError } from '../utils/ApiError.js';

function formatIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.slice(1).join('.'),
    message: issue.message,
  }));
}

export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body ?? {},
    query: req.query,
    params: req.params,
  });

  if (!result.success) {
    const errors = formatIssues(result.error.issues);
    const onlyUrlParts = result.error.issues.every((issue) => ['params', 'query'].includes(issue.path[0]));
    throw onlyUrlParts
      ? ApiError.badRequest('One of the supplied identifiers or filters is invalid.', errors)
      : ApiError.validation(errors);
  }

  req.validated = result.data;
  next();
};
