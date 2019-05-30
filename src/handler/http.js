import { http } from '../wrappers';
import { prepareValidation } from '../helpers';

const bodyDisallowedMethods = ['get', 'options', 'head', 'trace', 'ws'];
export default (path, fn, config, { schema } = {}, ajv) => {
  // For easier aliasing
  const { validation, validationStringify } = prepareValidation(ajv, schema);

  return async (res, req) => {
    // Crash handling
    res.onAborted(() => {
      res.aborted = true;
    });

    // For future usage
    req.rawPath = path;
    req.method = req.getMethod();

    const bodyCall =
      bodyDisallowedMethods.indexOf(req.method) === -1 && res.onData;
    const request = bodyCall
      ? await http.request(req, res, bodyCall)
      : http.request(req, res);

    if (validationStringify) {
      let errors;
      for (let i = 0, len = validation.length; i < len; i++) {
        const { type, validator } = validation[i];

        const valid = validator(req[type]);

        if (!valid) {
          if (!errors) {
            errors = [
              { type, messages: validator.errors.map((err) => err.message) }
            ];
          } else {
            errors.push({
              type,
              messages: validator.errors.map((err) => err.message)
            });
          }
        }
      }

      if (errors && !res.aborted) {
        return res.end(validationStringify(errors));
      }
    }

    const response = http.response(res, req, config, schema && schema.response);

    const result = fn.async
      ? await fn(request, response, config)
      : fn(request, response, config);

    if (!result) {
      return res.end(
        '{"error":"The route you visited does not returned response"}'
      );
    }
    if (!res.aborted) {
      if (!result.stream) {
        if (typeof result === 'string' && !res.statusCode) {
          res.end(result);
        } else {
          res.send(result);
        }
      }
    }
  };
};
