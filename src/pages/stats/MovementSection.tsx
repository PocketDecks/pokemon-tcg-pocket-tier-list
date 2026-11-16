import styled from "styled-components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LocaleLink as Link } from "../../app/locale-link";
import useDeckHref from "../../app/use-deck-href";
import type { FullDeckType } from "../../app/deck-types";
import type { PipelineMetaShare } from "../../types/pipeline-data";
import { hasMovement } from "../../app/meta-share-window";
import DeckArt from "../../components/DeckArt";
import NavIcon from "../../components/NavIcon";
import SupporterLink from "../../components/SupporterLink";
import crownIcon from "../../assets/crown.webp";
import { Loading, Section, SectionHeader, SectionTitle } from "./stats-section.styles";
import {
  MOVEMENT_VIEWS,
  buildMovementRows,
  selectMovementEntries,
  type MovementRow,
  type MovementView,
} from "./movement-rows";

const ToggleContainer = styled.div`
    display: flex;
    gap: 0.8rem;
    background: var(--bg);
    padding: 0.4rem;
    border-radius: 0.8rem;
`;

const ToggleButton = styled.button<{ $active: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.8rem 1.6rem;
    border-radius: 0.4rem;
    font-size: 1.4rem;
    font-weight: 500;
    background: ${(props) => (props.$active ? "var(--main)" : "transparent")};
    color: ${(props) => (props.$active ? "var(--bg)" : "var(--main)")};
    cursor: pointer;
    border: none;
    transition: background-color 160ms ease-out, color 160ms ease-out;

    &:hover {
        background: ${(props) => (props.$active ? "var(--main)" : "var(--line)")};
    }

    @media (max-width: 900px) {
        min-height: 4.4rem;
    }
`;

const MovementTable = styled.table`
    border-collapse: collapse;
    width: 100%;
    color: var(--main);

    font-size: 1.4rem;
    font-variant-numeric: tabular-nums;

    th,
    td {
        padding: 0.8rem 1.2rem;
        text-align: left;
        border-bottom: 1px solid var(--white-07);
    }

    th {
        font-size: 1.2rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--white-60);
    }

    td:first-child,
    th:first-child {
        width: 4rem;
        color: var(--white-50);
    }

    th:nth-child(3),
    td:nth-child(3) {
        width: 24rem;
    }

    th:last-child,
    td:last-child {
        width: 11rem;
        text-align: right;
    }

    tbody tr {
        transition: background-color 160ms ease-out;
    }

    tbody tr:hover {
        background: var(--white-03);
    }

    @media (max-width: 600px) {
        font-size: 1.3rem;

        th,
        td {
            padding: 0.8rem 0.6rem;
        }

        th:first-child,
        td:first-child {
            display: none;
        }

        th:nth-child(3),
        td:nth-child(3),
        th:last-child,
        td:last-child {
            width: auto;
        }
    }

    a {
        font-size: inherit;
        color: var(--main);
        text-decoration: none;
    }

    a:hover {
        text-decoration: underline;
    }

    tbody tr:last-child td {
        border-bottom: none;
    }
`;

const MovementNote = styled.p`
    margin: 0;
    color: var(--white-72);
    font-size: 1.4rem;
    line-height: 1.5;

    a {
        margin-left: 0.6rem;
        color: var(--main);
        font-weight: 600;
    }
`;

const Delta = styled.td<{ $rising: boolean }>`
    color: ${(props) => (props.$rising ? "var(--f-text)" : "var(--s-text)")};
    font-weight: 600;
    white-space: nowrap;

    svg {
        vertical-align: -0.2rem;
        margin-right: 0.4rem;
    }
`;

const DeckCell = styled.div`
    display: flex;
    align-items: center;
    gap: 1.2rem;
    min-width: 0;
`;

const ShareCell = styled.div`
    display: flex;
    align-items: center;
    gap: 1.2rem;
`;

const ShareTrack = styled.span`
    flex: 1;
    height: 0.6rem;
    border-radius: 0.3rem;
    background: var(--fill-hover);
    overflow: hidden;

    @media (max-width: 600px) {
        display: none;
    }
`;

const ShareFill = styled.span<{ $width: number }>`
    display: block;
    width: ${(props) => props.$width}%;
    height: 100%;
    border-radius: 0.3rem;
    background: var(--white-50);
`;

const ShareValue = styled.span`
    min-width: 4.8rem;
    text-align: right;
`;

const CrownLink = styled(SupporterLink)`
    flex-shrink: 0;
    display: inline-flex;
    margin-left: 0.4rem;

    img {
        width: 1.4rem;
        height: 1.4rem;
    }
`;

const VIEW_LABEL_KEYS: Record<MovementView, string> = {
    rising: "statistics.rising",
    falling: "statistics.falling",
    new: "statistics.newDecks",
};

const MovementTableRow = ({ row }: { row: MovementRow }) => {
    const { t } = useTranslation();
    return (
        <tr>
            <td>{row.rank}</td>
            <td>
                <DeckCell>
                    <DeckArt size={2.8} src={row.iconSrc} />
                    <Link to={row.href}>{row.displayName}</Link>
                    {row.premium && (
                        <CrownLink aria-label={t("premium.become")}>
                            <img src={crownIcon} alt="" />
                        </CrownLink>
                    )}
                </DeckCell>
            </td>
            <td>
                <ShareCell>
                    <ShareTrack aria-hidden="true">
                        <ShareFill $width={row.shareWidth} />
                    </ShareTrack>
                    <ShareValue>{row.shareLabel}</ShareValue>
                </ShareCell>
            </td>
            <Delta $rising={row.rising}>
                <NavIcon name={row.rising ? "arrowUp" : "arrowDown"} size={14} />
                {row.deltaLabel}
            </Delta>
        </tr>
    );
};

interface Props {
    metaShare: PipelineMetaShare | null;
    decksById: ReadonlyMap<string, FullDeckType>;
    view: MovementView;
    onViewChange: (view: MovementView) => void;
}

const MovementSection = ({ metaShare, decksById, view, onViewChange }: Props) => {
    const { t } = useTranslation();
    const deckHref = useDeckHref();

    const limited = !!metaShare && metaShare.decks.some((entry) => !hasMovement(entry));
    const rows = useMemo(
        () => buildMovementRows(selectMovementEntries(metaShare, view), decksById, deckHref),
        [metaShare, view, decksById, deckHref]
    );

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>{t("statistics.metaMovement")}</SectionTitle>
                <ToggleContainer>
                    {MOVEMENT_VIEWS.map((option) => (
                        <ToggleButton
                            key={option}
                            $active={view === option}
                            aria-pressed={view === option}
                            onClick={() => onViewChange(option)}
                        >
                            {t(VIEW_LABEL_KEYS[option])}
                        </ToggleButton>
                    ))}
                </ToggleContainer>
            </SectionHeader>

            {limited && (
                <MovementNote>
                    {t("statistics.movementPremium")}
                    <SupporterLink>{t("deckPage.premiumGateAction")}</SupporterLink>
                </MovementNote>
            )}

            {rows.length > 0 ? (
                <MovementTable>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>{t("statistics.deckColumn")}</th>
                            <th>{t("statistics.shareColumn")}</th>
                            <th>{t("statistics.deltaColumn")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <MovementTableRow key={row.name} row={row} />
                        ))}
                    </tbody>
                </MovementTable>
            ) : metaShare !== null ? (
                <Loading>{t("statistics.noMovement")}</Loading>
            ) : null}
        </Section>
    );
};

export default MovementSection;
