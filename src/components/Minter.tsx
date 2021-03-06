import { useEffect, useState } from 'react';
import Countdown from 'react-countdown';
import { Button, CircularProgress, Snackbar } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';

import * as anchor from '@project-serum/anchor';

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletDialogButton } from '@solana/wallet-adapter-material-ui';

import { CandyMachine, awaitTransactionSignatureConfirmation, getCandyMachineState, mintOneToken, shortenAddress } from '../candy-machine';

export interface MinterProps {
	candyMachineId: anchor.web3.PublicKey;
	config: anchor.web3.PublicKey;
	connection: anchor.web3.Connection;
	startDate: number;
	treasury: anchor.web3.PublicKey;
	txTimeout: number;
}

const Minter = (props: MinterProps) => {
	const [balance, setBalance] = useState<number>();
	const [isActive, setIsActive] = useState(false); // true when countdown completes
	const [isSoldOut, setIsSoldOut] = useState(false); // true when items remaining is zero
	const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT

	const [alertState, setAlertState] = useState<AlertState>({
		open: false,
		message: '',
		severity: undefined,
	});

	const [startDate, setStartDate] = useState(new Date(props.startDate));

	const wallet = useWallet();
	const [candyMachine, setCandyMachine] = useState<CandyMachine>();

	const onMint = async () => {
		try {
			setIsMinting(true);
			if (wallet.connected && candyMachine?.program && wallet.publicKey) {
				const mintTxId = await mintOneToken(candyMachine, props.config, wallet.publicKey, props.treasury);

				const status = await awaitTransactionSignatureConfirmation(mintTxId, props.txTimeout, props.connection, 'singleGossip', false);

				if (!status?.err) {
					setAlertState({
						open: true,
						message: 'Congratulations! Mint succeeded!',
						severity: 'success',
					});
				} else {
					setAlertState({
						open: true,
						message: 'Mint failed! Please try again!',
						severity: 'error',
					});
				}
			}
		} catch (error: any) {
			// TODO: blech:
			let message = error.msg || 'Minting failed! Please try again!';
			if (!error.msg) {
				if (error.message.indexOf('0x138')) {
				} else if (error.message.indexOf('0x137')) {
					message = `SOLD OUT!`;
				} else if (error.message.indexOf('0x135')) {
					message = `Insufficient funds to mint. Please fund your wallet.`;
				}
			} else {
				if (error.code === 311) {
					message = `SOLD OUT!`;
					setIsSoldOut(true);
				} else if (error.code === 312) {
					message = `Minting period hasn't started yet.`;
				}
			}

			setAlertState({
				open: true,
				message,
				severity: 'error',
			});
		} finally {
			if (wallet?.publicKey) {
				const balance = await props.connection.getBalance(wallet?.publicKey);
				setBalance(balance / LAMPORTS_PER_SOL);
			}
			setIsMinting(false);
		}
	};

	useEffect(() => {
		(async () => {
			if (wallet?.publicKey) {
				const balance = await props.connection.getBalance(wallet.publicKey);
				setBalance(balance / LAMPORTS_PER_SOL);
			}
		})();
	}, [wallet, props.connection]);

	useEffect(() => {
		(async () => {
			if (!wallet || !wallet.publicKey || !wallet.signAllTransactions || !wallet.signTransaction) {
				return;
			}

			const anchorWallet = {
				publicKey: wallet.publicKey,
				signAllTransactions: wallet.signAllTransactions,
				signTransaction: wallet.signTransaction,
			} as anchor.Wallet;

			const { candyMachine, goLiveDate, itemsRemaining } = await getCandyMachineState(anchorWallet, props.candyMachineId, props.connection);

			setIsSoldOut(itemsRemaining === 0);
			setStartDate(goLiveDate);
			setCandyMachine(candyMachine);
		})();
	}, [wallet, props.candyMachineId, props.connection]);

	return (
		<main>
			<div className="mx-auto w-64 mb-8 text-center">
				<div className="bg-gray-700">
					{wallet.connected && <p>Address: {shortenAddress(wallet.publicKey?.toBase58() || '')}</p>}
					{wallet.connected && <p>Balance: {(balance || 0).toLocaleString()} SOL</p>}
				</div>

				{!wallet.connected ? (
					<WalletDialogButton>Connect Wallet</WalletDialogButton>
				) : (
					<Button disabled={isSoldOut || isMinting || !isActive} variant="contained" color="primary" onClick={onMint}>
						{isSoldOut ? (
							<span className="px-4 py-2 rounded-lg bg-gray-700 text-gray-400">'SOLD OUT'</span>
						) : isActive ? (
							isMinting ? (
								<CircularProgress />
							) : (
								'MINT A PIZZSOL'
							)
						) : (
							<Countdown date={startDate} onMount={({ completed }) => completed && setIsActive(true)} onComplete={() => setIsActive(true)} renderer={renderCounter} />
						)}
					</Button>
				)}
			</div>

			<Snackbar open={alertState.open} autoHideDuration={6000} onClose={() => setAlertState({ ...alertState, open: false })}>
				<Alert onClose={() => setAlertState({ ...alertState, open: false })} severity={alertState.severity}>
					{alertState.message}
				</Alert>
			</Snackbar>
		</main>
	);
};

interface AlertState {
	open: boolean;
	message: string;
	severity: 'success' | 'info' | 'warning' | 'error' | undefined;
}

const renderCounter = ({ days, hours, minutes, seconds, completed }: any) => {
	return (
		<span>
			{hours} hours, {minutes} minutes, {seconds} seconds
		</span>
	);
};

export default Minter;
