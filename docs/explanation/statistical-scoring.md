# Explanation: Statistical scoring and recency weighting

The Pokemon TCG Pocket tier list ranks decks based on tournament performance. Raw win rates create a false picture when sample sizes are small. Thus, a deck that goes 5-0 may look stronger than a deck that goes 55-45, even though the second deck has proven itself over a much larger sample. The analysis pipeline's purpose is to correct this mathematically.

## The Wilson shrinkage estimator

The `calculate-card-scores.ts` file uses a Wilson-style shrinkage estimator to pull small-sample statistics downward.  
$$\frac{\hat{p} + \frac{z^2}{2n} - z \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}$$
* $\hat{p}$ is the observed win rate or popularity, 
* $n$ is the number of games,    
* and $z$ is roughly `1.96` (for a 95% confidence level).   

As $n$ grows, the score approaches the true observed rate.    
When $n$ is small, the formula heavily penalises the score, keeping one-off tournament runs from dominating the tier list.  

## Recency weighting

The meta changes quickly. The `get-multiplier.ts` file applies a recency weight to all games. Older tournaments receive a lower multiplier than tournaments played near the current date. The system calculates the multiplier linearly based on the time elapsed since the `EXPANSION_RELEASE_DATE`. That date comes from the newest dated expansion in the `pokemon-tcg-pocket-cards` package rather than a hand-edited constant, so the weighting follows the real release schedule. This ensures that recent tournament results have a stronger pull on the final rankings.    

## The qualification threshold

The pipeline ignores weak performances to avoid polluting the data with unoptimised lists or bad piloting. The `MIN_WINRATE_THRESHOLD` is set to `0.6`. A player must win at least 60 percent of their games in a tournament for their deck to enter the main scoring pool. Furthermore, the pipeline evaluates archetypes only if they accumulate at least `25` qualified games (`MIN_ARCHETYPE_QUALIFIED_GAMES`).

## Decks that match no listing

A deck whose cards pair with no Limitless listing row is filed under the `UNMATCHED_DECK` sentinel instead of being given an archetype name. The sentinel is deliberately not a card slug, so it cannot collide with a real archetype's name. The bucket is not ranked: the window artefact ranks it with the qualified field so the field shares stay whole, then drops its row before publishing, so it carries no win rate, no Power Score and no share in the published ranking. Its games still count in the field denominator and in the matchup tallies, because the opponents it played against recorded those games.

The pipeline logs how many decks landed in the bucket and how many qualified games they carry. A rise in that share is the signal that the pairing store missed something, and a run whose unmatched share passes `MAX_UNMATCHED_DECK_SHARE` is refused rather than published.