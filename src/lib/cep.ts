export type CepAddress = {
  zip_code: string;
  address: string;
  city: string;
  state: string;
};

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export function onlyCepDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 8);
}

export function formatCep(value: string) {
  const digits = onlyCepDigits(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export async function lookupCepAddress(value: string): Promise<CepAddress | null> {
  const digits = onlyCepDigits(value);
  if (digits.length !== 8) return null;

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) throw new Error('Não foi possível consultar o CEP.');

  const data = (await response.json()) as ViaCepResponse;
  if (data.erro) return null;

  const street = data.logradouro?.trim() || '';
  const neighborhood = data.bairro?.trim() || '';
  const address = [street, neighborhood].filter(Boolean).join(', ');

  return {
    zip_code: data.cep || formatCep(digits),
    address,
    city: data.localidade || '',
    state: data.uf || '',
  };
}
