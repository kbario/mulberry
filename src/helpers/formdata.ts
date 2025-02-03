export const objectifyFormData = (data: FormData) =>
  JSON.stringify(
    data.entries().reduce(
      (acc, [k, v]) => {
        acc[k] = v;
        return acc;
      },
      {} as Record<string, any>
    )
  );
