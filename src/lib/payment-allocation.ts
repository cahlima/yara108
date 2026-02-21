
import { Invoice, Payment, Allocation } from './types';

/**
 * Aloca uma lista de pagamentos não alocados a uma lista de faturas para um cliente específico.
 * Utiliza uma estratégia FIFO (First-In, First-Out): pagamentos mais antigos quitam faturas mais antigas.
 * A função é pura e retorna novos arrays com os objetos atualizados.
 * 
 * @param invoices - A lista completa de faturas de um cliente.
 * @param payments - A lista de pagamentos do cliente que AINDA NÃO foram alocados.
 * @returns Um objeto contendo as faturas atualizadas, os pagamentos com suas novas alocações e o crédito restante do cliente.
 */
export function allocatePaymentsToInvoicesForCustomer(
  invoices: Invoice[],
  payments: Payment[]
): { updatedInvoices: Invoice[]; updatedPayments: Payment[]; customerCredit: number } {

  // Cria cópias defensivas para evitar mutações inesperadas nos objetos originais
  const localInvoices: Invoice[] = JSON.parse(JSON.stringify(invoices));
  const localPayments: Payment[] = JSON.parse(JSON.stringify(payments));

  // Ordenar faturas da mais antiga para a mais nova (pelo mês)
  localInvoices.sort((a, b) => a.month.localeCompare(b.month));

  // Ordenar pagamentos do mais antigo para o mais novo (pela data de pagamento)
  localPayments.sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());

  const updatedInvoicesMap: Map<string, Invoice> = new Map();
  const updatedPaymentsMap: Map<string, Payment> = new Map();
  let customerCredit = 0;

  for (const payment of localPayments) {
    if (!payment.allocations) {
        payment.allocations = [];
    }

    let remainingPaymentAmount = payment.amount;

    for (const invoice of localInvoices) {
      if (remainingPaymentAmount <= 0.001) break; 

      const openAmount = invoice.openTotal;
      if (openAmount <= 0.001) continue; 

      const amountToAllocate = Math.min(remainingPaymentAmount, openAmount);
      
      payment.allocations.push({ invoiceId: invoice.id, amount: amountToAllocate });

      invoice.paidTotal += amountToAllocate;
      invoice.openTotal -= amountToAllocate;
      
      // *** CORREÇÃO SÊNIOR DA LÓGICA DE STATUS ***
      // Garante que o status seja atualizado corretamente com os valores esperados (maiúsculas)
      // e introduz o status 'PARTIAL' para pagamentos parciais.
      if (invoice.openTotal <= 0.01) { 
          invoice.openTotal = 0; // Zera o valor para evitar imprecisões de ponto flutuante
          invoice.status = 'PAID';
      } else {
          invoice.status = 'PARTIAL';
      }
      
      updatedInvoicesMap.set(invoice.id, invoice);
      remainingPaymentAmount -= amountToAllocate;
    }

    if (payment.allocations.length > 0) {
        updatedPaymentsMap.set(payment.id, payment);
    }

    if (remainingPaymentAmount > 0.01) {
        customerCredit += remainingPaymentAmount;
    }
  }

  return {
    updatedInvoices: Array.from(updatedInvoicesMap.values()),
    updatedPayments: Array.from(updatedPaymentsMap.values()),
    customerCredit,
  };
}
