from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly 1 match, found {count}')
    p.write_text(text.replace(old, new, 1))


# The production schema stores user-owned tokens directly in tokens.user_id.
replace_once(
    'src/lib/supabase.ts',
    '''    // 2. Fallback query if RPC isn't available\n    if (userId) {\n      const { data: utData } = await supabase\n        .from('user_tokens')\n        .select('id, token_id, tokens!inner(*)')\n        .eq('user_id', userId)\n        .eq('tokens.chain_id', cleanChain)\n        .ilike('tokens.contract_address', cleanAddress)\n        .maybeSingle();\n\n      if (utData) {\n        return {\n          exists: true,\n          userTokenId: utData.id,\n          tokenId: utData.token_id,\n          tokenData: utData.tokens,\n        };\n      }\n\n      // Legacy query fallback on tokens table directly\n      const { data: tokenData } = await supabase\n        .from('tokens')\n        .select('*')\n        .eq('user_id', userId)\n        .eq('chain_id', cleanChain)\n        .ilike('contract_address', cleanAddress)\n        .maybeSingle();\n\n      if (tokenData) {\n        return {\n          exists: true,\n          tokenId: tokenData.id,\n          tokenData,\n        };\n      }\n    }\n''',
    '''    // 2. Fallback query: the production schema stores ownership directly on tokens.user_id.\n    if (userId) {\n      const { data: tokenData, error: tokenError } = await supabase\n        .from('tokens')\n        .select('*')\n        .eq('user_id', userId)\n        .eq('chain_id', cleanChain)\n        .ilike('contract_address', cleanAddress)\n        .maybeSingle();\n\n      if (tokenError) {\n        console.warn('[Supabase] user token lookup failed:', tokenError.message);\n      }\n\n      if (tokenData) {\n        return {\n          exists: true,\n          tokenId: tokenData.id,\n          tokenData,\n        };\n      }\n    }\n'''
)

# Remove the stale user_tokens delete fallback; tokens is the ownership table.
replace_once(
    'src/lib/supabase.ts',
    '''    await supabase.from('user_tokens').delete().eq('user_id', activeUserId).eq('token_id', tokenId);\n    await supabase.from('tokens').delete().eq('id', tokenId).eq('user_id', activeUserId);\n''',
    '''    await supabase.from('tokens').delete().eq('id', tokenId).eq('user_id', activeUserId);\n'''
)

# user_addresses production columns are: user_id, address, chain_id, is_primary.
replace_once(
    'src/lib/supabase.ts',
    '''  // 3. Upsert into 'user_addresses' table\n  try {\n    const { error } = await supabase\n      .from('user_addresses')\n      .upsert(\n        {\n          user_id: userId,\n          wallet_address: cleanAddr,\n          chain_id: '137',\n          verified: true,\n          updated_at: new Date().toISOString(),\n        },\n        { onConflict: 'user_id' }\n      );\n\n    if (error && error.code !== '42P01') {\n      console.warn('user_addresses table upsert notice:', error.message);\n    }\n  } catch (dbErr) {\n    console.warn('Supabase user_addresses save note:', dbErr);\n  }\n\n  // Also sync address directly into profiles table (wallet_address column)\n  try {\n    await supabase.from('profiles').update({ wallet_address: cleanAddr, updated_at: new Date().toISOString() }).eq('id', userId);\n  } catch (e) {\n    console.warn('Profile wallet_address sync note:', e);\n  }\n\n  return { success: true, address: cleanAddr };\n''',
    '''  // 3. Persist to the production user_addresses schema. There is no unique\n  // constraint on user_id, so update the existing primary row or insert one.\n  try {\n    const now = new Date().toISOString();\n    const { data: existing, error: findError } = await supabase\n      .from('user_addresses')\n      .select('id')\n      .eq('user_id', userId)\n      .eq('chain_id', '137')\n      .eq('is_primary', true)\n      .maybeSingle();\n\n    if (findError) throw findError;\n\n    if (existing?.id) {\n      const { error } = await supabase\n        .from('user_addresses')\n        .update({ address: cleanAddr, is_primary: true, updated_at: now })\n        .eq('id', existing.id)\n        .eq('user_id', userId);\n      if (error) throw error;\n    } else {\n      // Keep one primary address per user/chain.\n      await supabase\n        .from('user_addresses')\n        .update({ is_primary: false, updated_at: now })\n        .eq('user_id', userId)\n        .eq('chain_id', '137');\n\n      const { error } = await supabase\n        .from('user_addresses')\n        .insert({\n          user_id: userId,\n          address: cleanAddr,\n          chain_id: '137',\n          is_primary: true,\n          created_at: now,\n          updated_at: now,\n        });\n      if (error) throw error;\n    }\n  } catch (dbErr: any) {\n    console.error('[Supabase] Failed to persist user_addresses row:', dbErr);\n    return { success: false, error: dbErr?.message || 'Failed to save withdrawal address.' };\n  }\n\n  // Keep profiles.wallet_address synchronized for older consumers.\n  try {\n    const { error } = await supabase\n      .from('profiles')\n      .update({ wallet_address: cleanAddr, updated_at: new Date().toISOString() })\n      .eq('id', userId);\n    if (error) console.warn('[Supabase] Profile wallet_address sync notice:', error.message);\n  } catch (e) {\n    console.warn('[Supabase] Profile wallet_address sync note:', e);\n  }\n\n  return { success: true, address: cleanAddr };\n'''
)

# Read the same production column used by the save path, preferring the primary row.
replace_once(
    'src/lib/supabase.ts',
    '''  // 1. Try DB profiles table (wallet_address column)\n  try {\n    const { data } = await supabase.from('profiles').select('wallet_address').eq('id', userId).maybeSingle();\n    if (data?.wallet_address && /^0x[a-fA-F0-9]{40}$/.test(data.wallet_address.trim())) {\n      return data.wallet_address.trim();\n    }\n  } catch {}\n\n  // 2. Try DB user_addresses table\n  try {\n    const { data } = await supabase.from('user_addresses').select('wallet_address').eq('user_id', userId).maybeSingle();\n    if (data?.wallet_address && /^0x[a-fA-F0-9]{40}$/.test(data.wallet_address.trim())) {\n      return data.wallet_address.trim();\n    }\n  } catch {}\n''',
    '''  // 1. Canonical source: production user_addresses.address primary row.\n  try {\n    const { data, error } = await supabase\n      .from('user_addresses')\n      .select('address')\n      .eq('user_id', userId)\n      .eq('chain_id', '137')\n      .eq('is_primary', true)\n      .maybeSingle();\n    if (!error && data?.address && /^0x[a-fA-F0-9]{40}$/.test(data.address.trim())) {\n      return data.address.trim();\n    }\n  } catch {}\n\n  // 2. Compatibility fallback for profiles.wallet_address.\n  try {\n    const { data } = await supabase.from('profiles').select('wallet_address').eq('id', userId).maybeSingle();\n    if (data?.wallet_address && /^0x[a-fA-F0-9]{40}$/.test(data.wallet_address.trim())) {\n      return data.wallet_address.trim();\n    }\n  } catch {}\n'''
)

# Hydrate the UI wallet from the authoritative profile balance/address instead of leaving
# walletAddress/isConnected in the stale local-cache state.
replace_once(
    'src/App.tsx',
    '''        setWallet((prev) => ({\n          ...prev,\n          totalTokens: bal,\n          totalUsd: bal * REWARD_RATE_USD,\n          unclaimedTokens: Number(profile.unclaimed_reward_balance || bal),\n          unclaimedUsd: Number(profile.unclaimed_reward_balance || bal) * REWARD_RATE_USD,\n        }));\n''',
    '''        const unclaimed = Number(profile.unclaimed_reward_balance ?? bal);\n        setWallet((prev) => ({\n          ...prev,\n          totalTokens: bal,\n          totalUsd: bal * REWARD_RATE_USD,\n          unclaimedTokens: unclaimed,\n          unclaimedUsd: unclaimed * REWARD_RATE_USD,\n          claimedTokens: Math.max(0, bal - unclaimed),\n          claimedUsd: Math.max(0, bal - unclaimed) * REWARD_RATE_USD,\n          walletAddress: profile.wallet_address || prev.walletAddress || '',\n          isConnected: true,\n        }));\n'''
)

replace_once(
    'src/App.tsx',
    '''        updatedWallet = {\n          ...wallet,\n          totalTokens: bal,\n          totalUsd: bal * REWARD_RATE_USD,\n          unclaimedTokens: unclaimed,\n          unclaimedUsd: unclaimed * REWARD_RATE_USD,\n        };\n''',
    '''        updatedWallet = {\n          ...wallet,\n          totalTokens: bal,\n          totalUsd: bal * REWARD_RATE_USD,\n          unclaimedTokens: unclaimed,\n          unclaimedUsd: unclaimed * REWARD_RATE_USD,\n          claimedTokens: Math.max(0, bal - unclaimed),\n          claimedUsd: Math.max(0, bal - unclaimed) * REWARD_RATE_USD,\n          walletAddress: freshProfile.wallet_address || wallet.walletAddress || '',\n          isConnected: true,\n        };\n'''
)

print('Token-care account sync fixes applied.')
