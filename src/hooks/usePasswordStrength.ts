import { useMemo } from 'react'

export type PasswordStrengthRule = {
  id: 'minLength' | 'hasUpper' | 'hasLower' | 'hasDigit' | 'hasSpecial'
  label: string
  satisfied: boolean
}

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  rules: PasswordStrengthRule[]
  label: 'Bardzo słabe' | 'Słabe' | 'Średnie' | 'Dobre' | 'Mocne'
}

/**
 * Hook calculating password strength based on rules
 * Returns score (0-4), list of rules with satisfaction status, and label
 */
export function usePasswordStrength(password: string): PasswordStrength {
  return useMemo(() => {
    // Define password rules
    const rules: PasswordStrengthRule[] = [
      {
        id: 'minLength',
        label: 'Minimum 8 znaków',
        satisfied: password.length >= 8,
      },
      {
        id: 'hasUpper',
        label: 'Wielka litera',
        satisfied: /[A-Z]/.test(password),
      },
      {
        id: 'hasLower',
        label: 'Mała litera',
        satisfied: /[a-z]/.test(password),
      },
      {
        id: 'hasDigit',
        label: 'Cyfra',
        satisfied: /[0-9]/.test(password),
      },
      {
        id: 'hasSpecial',
        label: 'Znak specjalny (opcjonalnie)',
        satisfied: /[^A-Za-z0-9]/.test(password),
      },
    ]

    // Calculate score based on satisfied rules (0-4)
    // Note: hasSpecial is optional, so we count satisfied rules excluding it for the base score
    const requiredRules = rules.slice(0, 4) // first 4 rules are required
    const satisfiedRequiredCount = requiredRules.filter((r) => r.satisfied).length
    const hasSpecial = rules[4].satisfied

    // Score calculation:
    // 0 = no rules satisfied
    // 1 = 1 rule satisfied
    // 2 = 2 rules satisfied
    // 3 = 3 rules satisfied
    // 4 = all required rules satisfied (optionally + special char for extra strength)
    let score: 0 | 1 | 2 | 3 | 4
    if (satisfiedRequiredCount === 4 && hasSpecial) {
      score = 4
    } else if (satisfiedRequiredCount === 4) {
      score = 3
    } else {
      score = satisfiedRequiredCount as 0 | 1 | 2 | 3
    }

    // Determine label based on score
    let label: 'Bardzo słabe' | 'Słabe' | 'Średnie' | 'Dobre' | 'Mocne'
    switch (score) {
      case 0:
      case 1:
        label = 'Bardzo słabe'
        break
      case 2:
        label = 'Słabe'
        break
      case 3:
        label = 'Średnie'
        break
      case 4:
        label = satisfiedRequiredCount === 4 && hasSpecial ? 'Mocne' : 'Dobre'
        break
    }

    return { score, rules, label }
  }, [password])
}
