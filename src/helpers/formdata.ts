const _objectifyFormData = (ignore: boolean) => (data: FormData) =>
  JSON.stringify(
    data
      .entries()
      .filter((x) => (ignore ? x.includes("ignore") : true))
      .reduce(
        (acc, [k, v]) => {
          acc[k] = v;
          return acc;
        },
        {} as Record<string, any>,
      ),
  );

export const objectifyFormData = _objectifyFormData(false);
export const objectifyFormDataButIgnore = _objectifyFormData(true);
