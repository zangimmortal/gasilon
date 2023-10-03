import type { Mint } from '@solana/spl-token';
import { getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import type { Connection, PublicKey } from '@solana/web3.js';
import { Keypair, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';

import { TokenFee } from '../core';

import type { TokenPriceInfo } from './jupiter';

export type TokenWithPriceInfo = {
	mint: PublicKey;
	priceInfo: TokenPriceInfo;
};

export type PricingParams = {
	costInLamports: number; // might be more than transaction fee when building config for creating account
	margin: number;
};

export async function getLamportsPerSignature(
	connection: Connection,
): Promise<number> {
	const transaction = new Transaction();
	transaction.feePayer = Keypair.generate().publicKey;
	transaction.recentBlockhash = (
		await connection.getLatestBlockhash()
	).blockhash;
	return (
		(await connection.getFeeForMessage(transaction.compileMessage())).value || 0
	);
}

export function createTokenFee(
	mint: PublicKey,
	priceInfo: TokenPriceInfo,
	mintInfo: Mint,
	associatedAccount: PublicKey,
	params: PricingParams,
): TokenFee {
	// convert params.costInLamports (price in SOL) to price in token
	const tokenPricePerSignature =
		(priceInfo.price / LAMPORTS_PER_SOL) * params.costInLamports;

	// add desired margin
	// for example, price is 0.01, margin is 0.9, then (1 / (1 - margin)) = 10 and price after margin is 0.1.
	const tokenPriceAfterMargin =
		tokenPricePerSignature * (1 / (1 - params.margin));

	// convert to int per decimals setting of token
	const tokenPriceInDecimalNotation =
		Math.floor(tokenPriceAfterMargin * 10 ** mintInfo.decimals) + 1;

	return new TokenFee(
		mint,
		associatedAccount,
		mintInfo.decimals,
		BigInt(tokenPriceInDecimalNotation),
	);
}

export function buildTokenFeeList(
	connection: Connection,
	feePayer: PublicKey,
	tokens: TokenWithPriceInfo[],
	params: PricingParams,
): Promise<TokenFee[]> {
	return Promise.all(
		tokens.map(async (token) =>
			createTokenFee(
				token.mint,
				token.priceInfo,
				await getMint(connection, token.mint),
				await getAssociatedTokenAddress(token.mint, feePayer),
				params,
			),
		),
	);
}