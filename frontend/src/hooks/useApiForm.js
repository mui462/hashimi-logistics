import { useCallback, useState } from 'react';
import { toFieldErrors } from '../utils/apiRequestError';

export function useApiForm(initialValues, submitAction) {
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await submitAction(values);
    } catch (error) {
      setFormError(error.message);
      setFieldErrors(toFieldErrors(error.errors));
    } finally {
      setIsSubmitting(false);
    }
  };

  return { values, fieldErrors, formError, isSubmitting, handleChange, handleSubmit };
}
